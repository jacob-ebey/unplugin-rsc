exports.decorateServerAction = function decorateServerAction(
  action,
  mod,
  name
) {
  Object.defineProperties(action, {
    $$typeof: {
      value: Symbol.for("server.action"),
    },
    module: {
      value: mod,
    },
    export: {
      value: name,
    },
  });
};

exports.registerServerReference = function registerServerReference(
  action,
  mod,
  name
) {
  return Object.defineProperties(action, {
    $$typeof: {
      value: Symbol.for("server.reference"),
    },
    module: {
      value: mod,
    },
    export: {
      value: name,
    },
  });
};

exports.registerClientReference = function registerClientReference(
  ref,
  mod,
  name
) {
  return Object.defineProperties(ref, {
    $$typeof: {
      value: Symbol.for("client.reference"),
    },
    module: {
      value: mod,
    },
    export: {
      value: name,
    },
  });
};
