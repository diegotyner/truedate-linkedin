# truedate-linkedin

A chrome extension to show original job posting dates. Also, even if you're not downloading the extension I strongly recommend reading the FYI about Browser Gate, a massive data privacy scandal LinkedIn is involved with and how to protect yourself.

### Installation

1. Copy files in some destination folder. git clone `https://github.com/diegotyner/truedate-linkedin`
2. In your chromium browser, go to chrome://extensions. Here, select developer mode and then load unpacked, directing to the `./dist/` folder.

### Usage

When searching on `https://www.linkedin.com/jobs/search/*` (the legacy search) you'll get a popup displaying both the original posting date (ignoring Repost date) and the expiry date.

- It will not work on the `linkedin.com/jobs/search-results/*` view, this uses a different scheme I don't feel like reverse engineering when I only use the legacy version (it has recency sorting).

### API & Interception Behavior

LinkedIn surfaces job posting details via two primary Voyager API endpoints:

- `https://www.linkedin.com/voyager/api/graphql?variables=(jobPostingUrn:urn%3Ali%3Afsd_jobPosting%3A{jobID})&queryId=voyagerJobsDashJobPostings...`

#### Data Format

Post dates are returned as Unix millisecond timestamps:

- `originalListedAt`: Milliseconds since Jan 01, 1970 UTC (e.g. `1783546126000` -> `Wed Jul 08 2026 21:28:46 GMT+0000`).
- `expireAt`: Expiration Unix timestamp in milliseconds.

### FYI - Browser Gate

You should know about LinkedIn's so called "[browser gate](https://browsergate.eu/)". Briefly, they scan visitor's profiles for known chrome extension hashes, and build user profiles without their knowledge. You can see this in your browser console, the hundreds of `chrome-extension://invalid/` errors. This isn't any extension you have loaded, this is LINKEDIN, THE WEBSITE scanning through thousands of possible extensions you could have, and systematically checking each of them. This tells them: your password manager, what LinkedIn automations you have enabled (Simplify), any accessibility needs you might have (colorblindness, eyesight), religious or political filters you might have enabled, and more.

To fix this (as of 8/5/26), you can add this custom filter to Ublock Origin or `brave://settings/shields/filters` custom filters:

- `linkedin.com##+js(no-fetch-if, /chrome-extension:/)`
