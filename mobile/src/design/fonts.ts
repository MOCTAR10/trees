import { AtkinsonHyperlegible_400Regular } from "@expo-google-fonts/atkinson-hyperlegible/400Regular";
import { AtkinsonHyperlegible_400Regular_Italic } from "@expo-google-fonts/atkinson-hyperlegible/400Regular_Italic";
import { AtkinsonHyperlegible_700Bold } from "@expo-google-fonts/atkinson-hyperlegible/700Bold";
import { BarlowSemiCondensed_600SemiBold } from "@expo-google-fonts/barlow-semi-condensed/600SemiBold";
import { BarlowSemiCondensed_700Bold } from "@expo-google-fonts/barlow-semi-condensed/700Bold";
import { useFonts } from "expo-font";

import { fonts } from "./tokens";

/** Only the five faces the design uses are bundled. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [fonts.display]: BarlowSemiCondensed_700Bold,
    [fonts.displaySemi]: BarlowSemiCondensed_600SemiBold,
    [fonts.body]: AtkinsonHyperlegible_400Regular,
    [fonts.bodyBold]: AtkinsonHyperlegible_700Bold,
    [fonts.bodyItalic]: AtkinsonHyperlegible_400Regular_Italic,
  });
  return loaded || !!error;
}
