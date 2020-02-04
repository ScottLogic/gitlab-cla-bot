const AWS = require("aws-sdk");

AWS.config.setPromisesDependency(Promise);

const s3 = new AWS.S3({ apiVersion: "2006-03-01" }); // newest version as of January 2020

const loggedMessages = [];
const detailedLoggedMessages = [];
let logFile = "log-" + (new Date().toDateString().replace(/\s/g, '-')); // TODO: nicer date format?

const logMessage = (level, message, detail) => {
  const logData = [new Date().toISOString(), level, message];
  
  // super crude filtering! these logs are displayed externally to end users
  // so we need to be v. careful about what is included.
  if (level !== "DEBUG") {
    loggedMessages.push(logData.join(" "));
  }

  logData.push(JSON.stringify(detail));
  detailedLoggedMessages.push(logData.join(" "));

  // log everything to std::out too
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
  },
  flush() {

    if (process.env.JASMINE) {
      return Promise.resolve({});
    }

    // try to write accumulated logs to bucket
    return Promise.all([
      s3
        .putObject({
          Body: loggedMessages.join("\r\n"),
          Bucket: process.env.LOGGING_BUCKET,
          Key: logFile,
          ACL: "public-read",
          ContentType: "text/plain"
        })
        .promise(),
      s3
        .putObject({
          Body: detailedLoggedMessages.join("\r\n"),
          Bucket: process.env.LOGGING_BUCKET,
          Key: `${logFile}-DEBUG`,
          ACL: "public-read",
          ContentType: "text/plain"
        })
        .promise()
    ]).catch(function(error) {
      console.log("Caught error while trying to write logs to S3: " + error);
    });
  }
};

module.exports = logger;
