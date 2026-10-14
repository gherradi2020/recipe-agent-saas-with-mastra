import type { ImageGenerateParams } from "openai/resources/images.mjs";
import type { Tool } from "@mastra/core/tools";
import type { ElaboratedRecipe } from "../schemas/recipe-schema";

import { elaboratedRecipeSchema } from "../schemas/recipe-schema";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import OpenAI from "openai";
import { ToolId } from "./ids";
import { uploadBase64ToS3 } from "../../file-upload/s3Utils";

const inputSchema = z.object({
  recipe: elaboratedRecipeSchema,
  userId: z.string().describe("The user ID for S3 file organization"),
});

const outputSchema = z.object({
  thumbnailUrl: z.string().describe("The S3 URL of the generated thumbnail"),
  success: z.boolean().describe("Whether the thumbnail was generated successfully"),
  error: z.string().optional().describe("Error message if generation failed"),
});

export type GenerateRecipeThumbnailOutput = z.infer<typeof outputSchema>;

export async function generateThumbnailForRecipe(recipe: ElaboratedRecipe, userId: string) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const output_format: ImageGenerateParams['output_format'] = 'webp';

    const imageResponse = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: `A high-quality, appetizing food photograph of ${recipe.title}. The image should be well-lit, professionally styled, and make the dish look delicious. Focus on the final plated dish with appealing presentation, natural lighting, and vibrant colors. No text or labels in the image. Use the ingredients and instructions to generate an accurate image: ${recipe.ingredients.join(', ')} ${recipe.instructions.join(', ')}`,
      size: '1024x1024',
      n: 1,
      output_format,
    });

    if (!imageResponse.data || imageResponse.data.length === 0|| imageResponse.data[0].b64_json === undefined) {
      return {
        thumbnailUrl: '',
        success: false,
        error: 'Failed to generate image from GPT',
      };
    }

    const base64Image = imageResponse.data[0].b64_json;

    const publicUrl = await uploadBase64ToS3(base64Image, userId, 'recipe-thumbnails', output_format);

    console.log('<><><><> S3 response:', publicUrl);    

    return {
      thumbnailUrl: publicUrl,
      success: true,
    };
  } catch (error) {
    console.error('Failed to generate recipe thumbnail:', error);
    return {
      thumbnailUrl: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export const generateRecipeThumbnail: Tool<typeof inputSchema, typeof outputSchema> = createTool({
  id: ToolId.GenerateRecipeThumbnail,
  description: "Generate a thumbnail image for a recipe using OpenAI DALL-E and store it in S3",
  inputSchema,
  outputSchema,
  execute: async (executionContext) => {
    const { recipe, userId } = executionContext.context;
    return await generateThumbnailForRecipe(recipe, userId);
  },
});
