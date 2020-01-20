const requestp = require("./requestAsPromise");
const is = require("is_js");

const dummyVerifier = contributors => committers => {
     return [];
};

// TODO : Reimplement all the existing verifiers

module.exports = config => {
  const configCopy = Object.assign({}, config);
  
  if (configCopy.contributors) {
    return dummyVerifier(configCopy.contributors);    
  }
  throw new Error(
    "A mechanism for verifying contributors has not been specified"
  );
};
