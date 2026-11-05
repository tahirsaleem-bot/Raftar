module.exports = {
  // Use system Chrome instead of Puppeteer's downloaded version
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR || `${process.env.HOME}/.cache/puppeteer`,
};
