# <YOUR_RECIPE_AGENT_SAAS>
[![Youtube Walkthrough -- Recipe Agent SaaS](https://img.youtube.com/vi/-mWmIaJ6AJk/0.jpg)](https://youtu.be/-mWmIaJ6AJk)

[Watch the YouTube Walkthrough](https://youtu.be/-mWmIaJ6AJk)


## About
This open source recipe agent SaaS app for React & NodeJS comes complete with:

- Auth
- Fullstack typesafety
- Stripe payments
- Agent memory
- AWS S3 file upload
- & a ton more

It was built on the [Open SaaS](https://opensaas.sh) template, which is a free, fullstack full-featured SaaS template powered by [Wasp](https://wasp.sh), and uses [Mastra AI](https://mastra.ai/) as the agent framework.

## Development

### Running locally

- Make sure you have [Wasp](https://wasp.sh) installed:

```bash
curl -sSL https://get.wasp.sh/installer.sh | sh
```

- Make sure to use Node v22

```bash
nvm use 22
```

- Copy the `.env.client` and `.env.server` files:

```bash
cp .env.server.example .env.server && cp .env.client.example .env.client
```

- Run the database and leave it running (docker must be installed and running):

```bash
wasp start db
```

- Start the wasp app and leave it running:

```bash
wasp start
```

- If this is the first time starting the app, or you've just made changes to your entities/prisma schema, also run:

```bash
wasp db migrate-dev
```

- Fill in the needed env vars in the `.env.server` file:
- AWS S3 credentials
- OpenAI API key
  🤠 See the [Open SaaS docs](https://docs.opensaas.sh) for full instructions and integration guides!
