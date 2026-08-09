const { getStreams } = require('./providers/watchanimeworld.js');

// Mock browser APIs for Node environment
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.TextDecoder = require('util').TextDecoder;

async function run() {
  console.log('Testing Naruto (20982)...');
  try {
    const streams = await getStreams('20982', 'tv', 1, 1);
    console.log('Streams found:', JSON.stringify(streams, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
  }
}

run();
