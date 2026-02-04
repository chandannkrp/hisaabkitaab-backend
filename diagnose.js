import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import dns from 'dns';

console.log('Node version:', process.version);
console.log('Platform:', process.platform);

// PUT YOUR ACTUAL CONNECTION STRING HERE
const uri = process.env.MONGO_URI

if (!uri || uri.includes('username')) {
  console.error('❌ Please update the connection string in the script!');
  process.exit(1);
}

console.log('\n--- Testing DNS Resolution ---');
dns.setDefaultResultOrder('ipv4first');

const hostnameMatch = uri.match(/@([^/]+)/);
if (hostnameMatch) {
  const hostname = hostnameMatch[1];
  console.log('Hostname:', hostname);
  
  dns.resolve4(hostname, (err, addresses) => {
    if (err) console.error('DNS resolve error:', err);
    else console.log('Resolved IPv4 addresses:', addresses);
  });
}

console.log('\n--- Testing Native MongoDB Driver ---');
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
});

try {
  await client.connect();
  console.log('✅ Native driver: SUCCESS');
  await client.close();
} catch (err) {
  console.error('❌ Native driver failed:');
  console.error('Error name:', err.name);
  console.error('Error code:', err.code);
  console.error('Error message:', err.message);
}

console.log('\n--- Testing Mongoose ---');
try {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('✅ Mongoose: SUCCESS');
  await mongoose.disconnect();
} catch (err) {
  console.error('❌ Mongoose failed:');
  console.error('Error name:', err.name);
  console.error('Error code:', err.code);
  console.error('Error message:', err.message);
}

process.exit(0);