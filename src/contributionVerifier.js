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
  const [
    emailVerification,
    usernameVerification
  ] = partition(lowerCaseContributors, c => c.includes("@"));

  const [
    domainVerification,
    exactEmailVerification
  ] = partition(emailVerification, c => c.startsWith("@"));

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

const configFileFromUrlVerifier = contributorListUrl => committers =>
  requestp({
    url: contributorListUrl,
    json: true
  }).then(contributors => contributorArrayVerifier(contributors)(committers));

const webhookVerifier = webhookUrl => committers =>
  Promise.all(
    committers.map(committer =>
      requestp({
        url: webhookUrl + committer.login,
        json: true
      }).then(response => ({
        username: committer.login,
        isContributor: response.isContributor
      }))
    )
  ).then(responses => {
    const contributors = responses
      .filter(r => r.isContributor)
      .map(r => r.username);
    return contributorArrayVerifier(contributors)(committers);
  });

module.exports = config => {
  const configCopy = Object.assign({}, config);

  if (configCopy.contributors) {
    if (is.array(configCopy.contributors)) {
      logger.info(
        "Checking contributors against the list supplied in the .clabot file"
      );
      return contributorArrayVerifier(configCopy.contributors);
    } else if (
      is.url(configCopy.contributors) &&
      configCopy.contributors.indexOf("?") !== -1
    ) {
      logger.info(
        "Checking contributors against the webhook supplied in the .clabot file"
      );
      return webhookVerifier(configCopy.contributors);
    } else if (is.url(configCopy.contributors)) {
      logger.info(
        "Checking contributors against the URL supplied in the .clabot file"
      );
      return configFileFromUrlVerifier(configCopy.contributors);
    }
  }
  throw new Error(
    "A mechanism for verifying contributors has not been specified"
  );
};
