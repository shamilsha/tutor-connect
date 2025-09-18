// Build version utility - Build time and number are captured during build process
const BUILD_VERSION = {
    version: process.env.REACT_APP_VERSION || '0.1.0',
    buildTime: process.env.REACT_APP_BUILD_TIME || new Date().toISOString(),
    buildNumber: parseInt(process.env.REACT_APP_BUILD_NUMBER) || Date.now(),
    environment: process.env.NODE_ENV || 'development',
    commitHash: process.env.REACT_APP_COMMIT_HASH || 'dev',
    branch: process.env.REACT_APP_BRANCH || 'dev'
};

export const getBuildInfo = () => {
    return {
        ...BUILD_VERSION,
        displayVersion: `${BUILD_VERSION.version}-${BUILD_VERSION.buildNumber}`,
        shortVersion: `${BUILD_VERSION.version}-${BUILD_VERSION.buildNumber.toString().slice(-6)}`
    };
};

export const getBuildDisplay = () => {
    const info = getBuildInfo();
    const buildTime = new Date(info.buildTime).toLocaleString();
    return `v${info.shortVersion} (${info.environment}) - ${buildTime}`;
};

export default BUILD_VERSION;
