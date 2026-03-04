# 🔢 PlaceNDigits

PlaceNDigits is a cross-platform mobile code-breaking game built with React Native (Expo) and Supabase. Players test their logic by attempting to guess a secret number, with dynamic difficulty levels and global leaderboards.

## ✨ Features
* **Dynamic Difficulty:** Choose between 3, 4, or 5-digit number challenges.
* **Frictionless Authentication:** Seamless Google Sign-In or a quick "Play as Guest" mode.
* **Global Leaderboards:** Real-time ranking system powered by Supabase.
* **Cross-Platform:** Compiled for iOS (via EAS) with an upcoming Web Expansion.
* **Dark Mode UI:** Sleek, modern interface with a custom dark splash screen.

## 🛠️ Tech Stack
* **Frontend:** React Native, Expo, React Navigation
* **Backend & Database:** Supabase (PostgreSQL)
* **Authentication:** Supabase Auth (OAuth with Google)
* **Build System:** Expo Application Services (EAS)

## 🚀 Getting Started

### Prerequisites
* Node.js and npm/Yarn installed
* [Expo CLI](https://docs.expo.dev/get-started/installation/) installed
* A [Supabase](https://supabase.com/) account and project

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/PlaceandDigits.git
   ```

2. Navigate to the project directory:
   ```bash
   cd PlaceandDigits
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Set up your environment variables. Create a `.env` file in the root directory and add your Supabase keys:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

5. Start the Expo development server:
   ```bash
   npx expo start
   ```

## 🎮 How to Play
The goal is to guess the secret number based on feedback from your guesses:
* **Digit:** A correct number but in the wrong position.
* **Place:** A correct number and in the correct position.


## 👤 Author
**Abhishek**
* GitHub: [@Abhishekp34](https://github.com/Abhishekp34/)
* LinkedIn: [Abhishek Patel](https://linkedin.com/in/abhipatel34)
