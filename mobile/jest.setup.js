jest.mock("react-native-worklets", () =>
  require("react-native-worklets/lib/module/mock"),
);

const { setUpTests } = require("react-native-reanimated");

setUpTests();
