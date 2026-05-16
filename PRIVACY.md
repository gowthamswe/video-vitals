# Privacy Policy for VideoVitals

**Last updated: 2026-05-16**

VideoVitals is a Chrome extension that lets you flag YouTube videos as clickbait and rate their information density, and shows you the community's ratings on those videos. This policy explains what data we collect, how we use it, and your rights.

## Data we collect

When you **sign in with Google**, we receive and store:

- Your Google user ID (a stable, opaque identifier used to attribute ratings to your account)
- Your email address (for support contact and account identification)
- Your display name (shown in the extension popup)
- Your Google profile picture URL (shown in the extension popup)

When you **rate a video**, we store:

- The YouTube video ID being rated
- The YouTube channel ID of that video
- Your clickbait flag (true / false) and/or information density rating (an integer from 1–10)
- A timestamp of when the rating was created or last updated

## Data we do NOT collect

- **No browsing history.** We do not record which YouTube pages you visit.
- **No watch history.** We do not record which videos you watch, for how long, or how much you completed.
- **No video metadata** beyond the video ID and channel ID you explicitly rate.
- **No data from anonymous users.** If you are not signed in, no information about you is collected.
- **No tracking pixels, analytics, or advertising identifiers.**

## How we use your data

- To attribute your ratings to your account so you can view, update, or remove them
- To compute aggregate community statistics (total flag counts and average density per video)
- For nothing else. We do not use your data for advertising, do not sell it, and do not share it with third parties beyond the infrastructure providers listed below.

## Where your data is stored

All data is stored in **Google Cloud Firestore** (Firebase), operated by Google LLC, with servers located in the United States. Google's privacy and security practices govern this storage:

- Firebase Privacy and Security: https://firebase.google.com/support/privacy
- Google Cloud Privacy: https://cloud.google.com/privacy

We use Google for authentication (OAuth 2.0) and database hosting. Google does not receive any data from us beyond what is required to operate these services.

## Who can see your data

- **You** can see your own ratings, profile, and aggregate community statistics through the extension.
- **Other signed-in or anonymous users** can see the aggregate community statistics for any video (e.g. total flag count, average density, total raters). Your individual identity is **not** exposed in these aggregates — only the totals are shown.
- **The maintainer** has administrative access to the underlying Firestore database for debugging, abuse prevention, and responding to your support requests.

## Your rights and choices

- **Sign out** at any time from the extension popup. Signing out clears your local session; your past ratings remain on the server unless you ask us to delete them.
- **Update a rating** by re-rating the same video; the new value overwrites the old.
- **Remove a single rating** by clearing your clickbait flag or density rating from the watch-page UI. The corresponding field is deleted from your stored rating.
- **Delete all your data.** Email **hello@gowtham.ai** from your registered email address. We will delete all your ratings and your account record within 14 days and confirm the deletion by reply.

## Data retention

Ratings are retained indefinitely so that community statistics remain accurate over time. Account-profile data (email, name, profile picture URL) is retained while your account is active. If you request account deletion, all associated data — ratings and profile — is removed.

## Children's privacy

VideoVitals is not directed at children under 13 and does not knowingly collect personal information from them. If you believe a child has provided us with personal information, please contact us and we will delete it.

## Security

Data is transmitted over HTTPS and stored in Google Cloud Firestore. Access to the database is restricted by Firebase Security Rules: writes are limited to the authenticated owner of each rating, and reads are limited to aggregated community statistics. Administrative access is limited to the maintainer.

## Changes to this policy

We may update this policy from time to time. Material changes will be reflected in the **Last updated** date at the top of this document and announced in the extension popup. Continued use of VideoVitals after a change indicates acceptance of the updated policy.

## Contact

Questions, deletion requests, or other privacy concerns:

**hello@gowtham.ai**
