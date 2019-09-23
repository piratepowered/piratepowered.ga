# piratepowered.ga
The source code for (now retired) piratepowered.ga. If you have issues setting this up, create an issue and I might reply.

# Usage
1. Install node.js*
2. Configure settings in `index.js`*
3. Run: `npm install`*
4. Run: `node index.js`

*One time only

# Todo
This was my todo list draft:
- [ ] Use buildid instead of date in filename
- [ ] Add system to deal with dead links: check each link per 2-3 seconds, if dead remove all parts, only multiup.org (remove openload)
- [ ] Add name, url, hashes, size and date of upload to database
- [ ] Add noscript version: use forms, standard dropdown boxes and inputs and <noscript>
- [ ] Add DMCA support and ways to circumvent copyright issues
- [ ] Add donate options (steam family sharing?, paypal?, bitcoin, steam keys/gifts)
- [ ] Add column with game DRM
- [ ] Add column with release date
- [ ] Add column with price
- [ ] Add downloads date sorting
- [ ] Add vote count sorting (upload queue)
- [ ] Add stats: total downloads, total online, time online
- [ ] Improve security: encrypt IP's, don't store identifiable data
- [ ] Improve request links: checkboxes, copy list, download all, mark outdated, better dialog, details (name, url, hashes, size and date of upload), recaptcha?
- [ ] Improve speed: do tasks parallel (except downloading)
- [ ] Improve voting: add rate limits, add ability to undo vote, disallow proxies?
- [ ] Improve downloads: add language packs, different OS versions, workshop rips
