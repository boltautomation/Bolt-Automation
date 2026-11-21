# Bolt promo site

A buildless, responsive promotional site using the desktop UI's exact **#141414** background, neutral surfaces, and a restrained yellow-green logo accent. The layout centers the real screenshot, keeps copy concise, and combines the feature details into one tabbed workspace section. Static HTML, CSS, and JavaScript; no analytics, forms, cookies, or hosted AI calls. A small Vercel Function serves cached, public GitHub release download totals without tracking site clicks or visitors.

The workspace showcase and download panel retain the original green gradient styling. The download panel includes a faint transparent logo watermark. The full-width navbar stays visible while scrolling with only a translucent yellow-green gradient fading to transparent, without a solid fill, blur, or bottom border. Anchor offsets leave room for the sticky navigation on desktop and mobile. The supplied app screenshot has a rectangular yellow-green backlight around all four edges and subtle hover parallax, with no decorative window bar or full-size link.

Production: **https://bolt-automation.vercel.app**. Vercel project: **bolt-automation**, ID **prj_dRR68XD4me2xFwzrPo324YPkGmXb**, in **johnasdr39-1559s-projects**. Production is public; preview deployments retain Vercel Authentication. The initial release was uploaded through the Vercel API; GitHub pushes do not automatically redeploy this project. Upload only this directory's deployable files for future releases, or explicitly configure the Git integration with **website** as its root directory.

Deploy this **website/** directory as the Vercel project root using the Other/static preset and no build command. Do not deploy the repository root, app runtime, or saved data. The desktop app itself remains a Windows download and does not run on this website.

Download links target the latest Windows, Apple Silicon Mac, and Intel Mac release packages on GitHub. The hero uses the supplied screenshot of the real desktop app; other previews are labeled illustrative. Pointer-driven screenshot parallax settles smoothly, stops when idle, and respects reduced motion and touch devices. Feature tabs, a demo-only pace slider, mobile navigation, and FAQ disclosures work in the browser.

Separate app usage and website terms are linked in the footer and beside the download. They cover authorized educational use, AI and automation risks, third-party services, privacy, and limits on warranties and liability while preserving mandatory rights. The terms are not a guarantee of legal protection; the operator should have a qualified lawyer review the wording, operator identity, jurisdiction, and assent process for their circumstances. Nothing adds an acceptance gate to the existing desktop release.

Fonts are self-hosted; their Open Font License is in **assets/Manrope-OFL.txt**. The logo is the supplied Bolt asset. Preview locally with **node tools/preview-website.cjs** from the repository root.

The download counter sums ZIP asset download counts across published GitHub releases (Windows and both Mac architectures), excluding checksum files. Results are cached at the CDN for 15 minutes; an unavailable total is shown honestly. The navbar logo is larger and makes one clockwise turn per hover, respecting reduced-motion settings.
