# How to run the application

- clone the application with command `git clone https://github.com/merko30/habit-tracker`
- in the root folder run `npm run install:all` to install packages
- to run the server, run `npm run dev` in the server folder
- you'll get the API URL, copy it
- in mobile-app folder run `cp .env.example .env` and set `EXPO_PUBLIC_API_URL=copied value`
- to run the mobile app, run `npm start`
- to run the app on a device, you need to download Expo Go application
- scan the QR code from the terminal

# Test user
You can either sign up or use the testing user:
- test@example.com
- password123

# Notes
- to delete a habit, swipe to left
- to test syncing when online, I had to reload the app, the net info event doesn't work as expected, at least with Expo Go
