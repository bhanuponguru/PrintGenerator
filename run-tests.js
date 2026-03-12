const { exec } = require('child_process');
const fs = require('fs');

exec('npm test', (error, stdout, stderr) => {
  const output = stdout + '\n' + stderr;
  fs.writeFileSync('contents.txt', output, 'utf8');
  console.log('Tests complete. Output saved to contents.txt');
  process.exit(error ? 1 : 0);
});
