Build Drift, sync to iOS, and open in Xcode for simulator preview.

Run the following steps in order:

1. Run `npm run build` in `/Users/morhogeg/Drift` to compile TypeScript and bundle with Vite
2. Run `npx cap sync ios` to copy web assets to the iOS project
3. Run `npx cap open ios` to open Xcode (user then hits ▶ to run on simulator)

Report any build errors clearly. If the build succeeds, tell the user to hit Run (▶) in Xcode.
If `npx cap open ios` was already run this session and Xcode is open, skip step 3 and just tell the user to hit Run.
