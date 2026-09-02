const base = require('@ionic/swiftlint-config');

module.exports = {
  ...base,
  excluded: [...base.excluded, '${PWD}/.build'],
};
