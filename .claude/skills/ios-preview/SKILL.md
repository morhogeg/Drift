---
name: ios-preview
description: Build Drift, sync to iOS, and open in simulator. Runs `npm run build && npx cap sync ios` then opens Xcode or the simulator.
disable-model-invocation: false
---

Run the following steps in order to preview Drift on the iOS simulator:

1. Run `npm run build` to compile TypeScript and bundle with Vite
2. Run `npx cap sync ios` to copy web assets to the iOS project
3. Run `npx cap open ios` to open Xcode (user then hits ▶ to run on simulator)

Report any build errors clearly. If the build succeeds, tell the user to hit Run (▶) in Xcode.
If `npx cap open ios` was already run this session and Xcode is open, skip step 3 and just tell the user to hit Run.
