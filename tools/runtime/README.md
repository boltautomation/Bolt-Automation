# Bundled runtime

Node.js **26.13.0**, Windows x64, copied from the installed Node runtime on the build computer. No installer or global PATH changes are needed to run this executable.

**LICENSE.txt** contains the matching Node.js and bundled third-party notices, obtained from the [official versioned source](https://github.com/nodejs/node/blob/v26.13.0/LICENSE). Keep it with node.exe when distributing Bolt. PDF.js and native canvas notices remain with their dependency folders in the package.

The package builder records the runtime version and each shipped file's SHA-256 hash. Replacing this runtime requires checking compatibility, updating its notices, rebuilding, and rerunning the package smoke check.
