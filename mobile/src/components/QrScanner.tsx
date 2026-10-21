import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";

import { useSystemInsets } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Txt } from "../design/ui";

interface Props {
  hint: string;
  cancelLabel: string;
  onCode: (value: string) => void;
  onClose: () => void;
  /** Shown in a Modal (its own window): keep the controls clear of the phone's bars. */
  safeArea?: boolean;
  testID?: string;
}

/** Full-screen camera that returns the first QR / barcode it reads. */
export default function QrScanner({ hint, cancelLabel, onCode, onClose, safeArea, testID }: Props) {
  const s = useStyles();
  const insets = useSystemInsets();
  const t = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);
  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
  }, [permission, requestPermission]);
  return (
    <View style={s.scan} testID={testID}>
      {permission?.granted ? (
        <CameraView
          style={s.fill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "datamatrix"] }}
          onBarcodeScanned={({ data }) => {
            const value = data?.trim();
            if (!value || done.current) return;
            done.current = true;
            onCode(value);
          }}
        />
      ) : null}
      <View style={[s.bar, safeArea && insets.bottom > 0 && { paddingBottom: t.space.lg + insets.bottom }]}>
        <Txt variant="small" style={s.text}>
          {hint}
        </Txt>
        <Button label={cancelLabel} variant="secondary" compact onPress={onClose} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  scan: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000" },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: th.space.lg,
    gap: th.space.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
  },
  text: { color: "#FFFFFF", textAlign: "center" },
}));
