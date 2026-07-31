const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create test user
  const user = await prisma.user.create({
    data: {
      id: 'test-user-001',
      email: 'test@example.com',
      name: 'Test User',
    },
  });
  console.log('User created:', user.id);

  // Create test blog post
  const post = await prisma.blogPost.create({
    data: {
      id: 'test-post-001',
      userId: user.id,
      title: 'How to Build AI-Powered Apps',
      topic: 'Building AI-powered web applications with Next.js and Vercel AI SDK',
      status: 'DRAFT',
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-5',
      tone: 'TECHNICAL',
      length: 'MEDIUM',
    },
  });
  console.log('BlogPost created:', post.id);
  console.log('---');
  console.log('UserId:', user.id);
  console.log('PostId:', post.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
