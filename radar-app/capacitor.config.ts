import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cat.quimfornes.radarvalors",
  appName: "Radar de Valors",
  webDir: "dist",
  ios: { contentInset: "never", backgroundColor: "#f2f4f8" },
};

export default config;
