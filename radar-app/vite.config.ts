import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// relative base so the same build runs on any host path and inside the native shell
export default defineConfig({ base: "./", plugins: [react()], build: { target: "es2022" } });
