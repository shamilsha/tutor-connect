const { execSync } = require('child_process');

// Generate build time and number
const buildTime = new Date().toISOString();
const buildNumber = Date.now();

console.log(`Building with build time: ${buildTime}`);
console.log(`Building with build number: ${buildNumber}`);

// Set environment variables and run the build
const env = {
    ...process.env,
    REACT_APP_BUILD_TIME: buildTime,
    REACT_APP_BUILD_NUMBER: buildNumber.toString()
};

// Run the build command
execSync('react-scripts build', { 
    stdio: 'inherit',
    env 
});

console.log('Build completed successfully!');
