const requestp = require("./requestAsPromise");
const logger = require("./logger");
const is = require("is_js");

// see: https://stackoverflow.com/a/47225591/249933
function partition(array, isValid) {
  return array.reduce(
    ([pass, fail], elem) => {
      return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
    },
    [[], []]
  );
}

const domainFromEmail = email => "@" + email.split("@")[1];

const contributorArrayVerifier = contributors => committers => {
  const lowerCaseContributors = contributors.map(c => c.toLowerCase());
  const [emailVerification, usernameVerification] = partition(
    lowerCaseContributors,
    c => c.includes("@")
  );

  const [domainVerification, exactEmailVerification] = partition(
    emailVerification,
    c => c.startsWith("@")
  );

  // check exact email, then domain, then username
  const isValidContributor = c => {
    if (c.email) {
      if (exactEmailVerification.includes(c.email.toLowerCase())) {
        return true;
      }
      if (domainVerification.includes(domainFromEmail(c.email))) {
        return true;
      }
    }
    if (usernameVerification.includes(c.login.toLowerCase())) {
      return true;
    }
    return false;
  };

  const res = committers.filter(c => !isValidContributor(c)).map(c => c.login);
  return Promise.resolve(res);
};

// TODO : Reimplement all other existing verifiers

module.exports = config => {
  const configCopy = Object.assign({}, config);
  
  if (configCopy.contributors) {
    if (is.array(configCopy.contributors)) {
      logger.info("Checking contributors against the list supplied in the .clabot file")
      return contributorArrayVerifier(configCopy.contributors);
    }
  }
  throw new Error("A mechanism for verifying contributors has not been specified");
};
