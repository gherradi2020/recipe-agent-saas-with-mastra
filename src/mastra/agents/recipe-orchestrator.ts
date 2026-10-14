import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { openai } from '@ai-sdk/openai';
import { getCurrentDate } from '../tools/get-current-date';
import { generateCompleteRecipes } from '../workflow/generate-complete-recipes';
import { getUserRecipes } from '../tools/get-user-recipes';
import { AgentId } from './ids';
import { mastraStorageUrl } from '../storage';

export const recipeOrchestrator = new Agent({
  id: AgentId.RecipeOrchestrator,
  name: AgentId.RecipeOrchestrator,
  instructions: `You are a friendly culinary assistant that helps the user brainstorm recipe ideas and chat about cooking.
    
    You have access to the user's personal recipe collection and can:
    - Search through their saved and favorite recipes
    - Help them find recipes they've previously saved
    - Generate new detailed recipes when requested

    Update your working memory  when the user provides:
    - Total Prep & CookTime Preferences
    - Ingredients Preferences
    - Difficulty Preferences
    - Style Preferences
    - Planning Topic
    - Ingredients on hand
    - Ingredients to buy
    
    When the user asks about their existing recipes, use the 'getUserRecipes' tool to search their collection. 
    When the user asks for full/detailed instructions for new recipe ideas, call the 'generateCompleteRecipes' workflow with an array of titles.
    
    Always be helpful and provide cooking tips, substitutions, and meal planning advice.
    DO NOT return full recipes, only provide recipe ideas and summaries of instructions.
    `,
  model: openai('gpt-4o-mini'),
  tools: {
    getCurrentDate,
    getUserRecipes,
  },
  workflows: {
    generateCompleteRecipes,
  },
  memory: new Memory({
    storage: new LibSQLStore({
      url: mastraStorageUrl,
    }),
    vector: new LibSQLVector({
      connectionUrl: mastraStorageUrl,
    }),
    embedder: openai.embedding('text-embedding-3-small'),
    options: {
      semanticRecall: true,
      lastMessages: 12, // default is 10
      workingMemory: {
        enabled: true,
        template: returnWorkingMemoryTemplate(),
      },
    },
  }),
});

function returnWorkingMemoryTemplate() {
  return `
## Meal Preferences

- Total Prep & CookTime Preferences: [e.g., < 30 minutes, > 30 minutes]
- Ingredients Preferences: [e.g., Vegetarian, Vegan, Gluten-free]
- Difficulty Preferences: [e.g., Easy, Medium, Hard]
- Style Preferences: [e.g., Comfort Food, Healthy, International]

## Current Meal Planning

### Planning Topic: [e.g., Recipe Brainstorming, Meal Planning]

### Ingredients on hand
  - Ingredient 1
  - Ingredient 2
  - Ingredient 3

### Ingredients to buy
  - Ingredient 1
  - Ingredient 2
  - Ingredient 3

### Recipes already eaten/cooked
  - Recipe 1
  - Recipe 2
  - Recipe 3

### Meals to make
  - Recipe 1
  - Recipe 2
  - Recipe 3
`;
}
