# VideoVitals Chrome Extension

VideoVitals is a Chrome Extension that allows users to rate YouTube videos based on whether they are clickbait and on their information density. This feedback helps build a more transparent YouTube experience for the community.

This project was bootstrapped with Firebase Studio.

## Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/) (React)
*   **UI:** [ShadCN UI](https://ui.shadcn.com/) & [Tailwind CSS](https://tailwindcss.com/)
*   **Backend:** [Firebase](https://firebase.google.com/) (Authentication & Firestore)
*   **Icons:** [Lucide React](https://lucide.dev/)

## Getting Started Locally

To get a local copy up and running, follow these simple steps.

### Prerequisites

*   **Node.js & npm:** Make sure you have Node.js (v18 or later) and npm installed. You can download them from [nodejs.org](https://nodejs.org/).
*   **Git:** You need Git to clone the repository. [Download Git](https://git-scm.com/downloads).

### Installation

1.  **Clone the repo**
    ```sh
    git clone https://github.com/your_username/your_repository.git
    ```
2.  **Navigate to the project directory**
    ```sh
    cd your_repository
    ```
3.  **Install NPM packages**
    ```sh
    npm install
    ```
4.  **Run the development server**
    The app will be available at `http://localhost:9002`.
    ```sh
    npm run dev
    ```

## Building the Chrome Extension

To package the application for the Chrome Web Store, follow these steps.

1.  **Add Extension Icons**
    Make sure you have the required icons in the `public/` directory:
    *   `public/icon16.png` (16x16)
    *   `public/icon48.png` (48x48)
    *   `public/icon128.png` (128x128)

2.  **Run the build command**
    This command compiles the Next.js app into a static `out/` directory.
    ```sh
    npm run build
    ```

3.  **Package the Extension**
    *   Navigate to the generated `out/` folder.
    *   Select all the files *inside* this folder.
    *   Compress them into a single `.zip` file (e.g., `videovitals.zip`).

4.  **Upload to Chrome Web Store**
    *   Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
    *   Click "Add new item" and upload your `.zip` file.
    *   Fill out the store listing details and submit for review.
