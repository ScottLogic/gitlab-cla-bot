// TODO : Reimplement most of this with AWS
const logMessage = (level, message, detail) => {
  const logData = [new Date().toISOString(), level, message];
  logData.push(JSON.stringify(detail));
  console.info(logData.join(" "));
};

const logger = {
  debug(message, detail) {
    logMessage("DEBUG", message, detail);
  },
  info(message, detail) {
    logMessage("INFO", message, detail);
  },
  error(message, detail) {
    logMessage("ERROR", message, detail);
  }  
};

module.exports = logger;
