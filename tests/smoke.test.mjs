import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';

const server = process.env.SMOKE_SERVER_URL ?? 'http://127.0.0.1:3001';
const frontend = process.env.SMOKE_FRONTEND_URL ?? 'http://127.0.0.1:3000';
const mail = process.env.SMOKE_MAIL_URL ?? 'http://127.0.0.1:8025';
for (const url of [server, frontend, mail]) {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname),
    'Smoke tests create temporary accounts and must only target local services');
}

async function post(path, body, sessionId) {
  return fetch(`${server}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { Authorization: `Bearer ${sessionId}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

test('built frontend serves the application and its JavaScript asset', async () => {
  const response = await fetch(frontend);
  assert.equal(response.status, 200);
  const html = await response.text();
  const script = html.match(/src="([^"]+\.js)"/);
  assert.ok(script, 'Application HTML must include a built JavaScript asset');
  const asset = await fetch(new URL(script[1], frontend));
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
});

test('unauthenticated recipe requests are rejected', async () => {
  const response = await post('/operations/get-user-recipes', { json: {} });
  assert.equal(response.status, 401);
});

test('SMTP verification, login and recipe persistence work without paid integrations', async () => {
  assert.ok(process.env.DATABASE_URL, 'Set DATABASE_URL to the local smoke database');
  const prisma = new PrismaClient();
  const email = `smoke-${randomUUID()}@example.test`;
  const password = randomUUID();
  let messageId;
  try {
    const signup = await post('/auth/email/signup', { email, password });
    assert.equal(signup.status, 200, await signup.text());
    const user = await prisma.user.findUnique({ where: { email } });
    assert.ok(user, 'Signup must persist a user through Prisma');

    const unverified = await post('/auth/email/login', { email, password });
    assert.equal(unverified.status, 401, 'Production must enforce email verification');

    let message;
    for (let attempt = 0; attempt < 20; attempt++) {
      const inbox = await (await fetch(`${mail}/api/v1/messages`)).json();
      message = inbox.messages.find((item) => item.To.some((recipient) => recipient.Address === email));
      if (message) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(message, 'Verification email must arrive in the local SMTP inbox');
    messageId = message.ID;
    const content = await (await fetch(`${mail}/api/v1/message/${messageId}`)).json();
    const token = `${content.Text}\n${content.HTML}`.match(/[?&]token=([^\s"<>]+)/)?.[1];
    assert.ok(token, 'Email must contain a verification token');
    const verify = await post('/auth/email/verify-email', { token: decodeURIComponent(token) });
    assert.equal(verify.status, 200, await verify.text());

    const login = await post('/auth/email/login', { email, password });
    assert.equal(login.status, 200);
    const { sessionId } = await login.json();
    assert.ok(sessionId);

    const recipe = {
      title: 'Smoke test soup', ingredients: ['water'], instructions: ['Boil'],
      dateCreated: '2026-10-14', thumbnailUrl: null,
    };
    const save = await post('/operations/save-recipes', { json: [recipe] }, sessionId);
    assert.equal(save.status, 200, await save.text());
    const persisted = await prisma.recipe.findFirst({ where: { userId: user.id } });
    assert.equal(persisted?.title, recipe.title);

    const list = await post('/operations/get-user-recipes', { json: {} }, sessionId);
    assert.equal(list.status, 200);
    const recipes = (await list.json()).json;
    assert.equal(recipes.length, 1);
    assert.equal(recipes[0].id, persisted.id);

    const favorite = await post('/operations/toggle-favorite-recipe', { json: { recipeId: persisted.id } }, sessionId);
    assert.equal(favorite.status, 200);
    assert.equal((await prisma.recipe.findUnique({ where: { id: persisted.id } })).isFavorite, true);
    const remove = await post('/operations/delete-recipe', { json: { recipeId: persisted.id } }, sessionId);
    assert.equal(remove.status, 200);
    assert.equal(await prisma.recipe.count({ where: { userId: user.id } }), 0);
  } finally {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.recipe.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
    if (messageId) await fetch(`${mail}/api/v1/messages`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IDs: [messageId] }),
    });
  }
});
