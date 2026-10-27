# 🏙️ CITISENSE: A GEO-SPATIAL AI PLATFORM FOR AUTOMATED CLASSIFICATION, CLUSTER DETECTION, AND PRIORITIZATION OF URBAN CONCERNS

CitiSense is an AI-powered complaint management platform designed to help Local Government Units (LGUs) efficiently process, classify, prioritize, and monitor citizen complaints. Through Artificial Intelligence (AI), Natural Language Processing (NLP), Computer Vision, geospatial analysis, and real-time monitoring, the system improves the speed, accuracy, and transparency of complaint resolution.

---

## 🎯 Project Purpose

This project aims to address common challenges faced by Local Government Units in handling citizen complaints, including delayed responses, misclassified reports, lack of prioritization, and limited monitoring capabilities.

### Key Features

1. **Automated Complaint Classification**
   - Categorize complaints into appropriate departments using AI and NLP.

2. **Smart Prioritization**
   - Assign priority levels based on urgency and severity.

3. **Geo-Spatial Cluster Detection**
   - Detect complaint hotspots using location data and report frequency.

4. **Real-Time Complaint Tracking**
   - Allow citizens and government personnel to monitor complaint progress.

5. **Improved Transparency**
   - Provide dashboards, analytics, and notifications throughout the complaint lifecycle.

---

## ⚙️ Setup Instructions

CitiSense is an Expo SDK 54 / React Native mobile app. Use the steps below to install and run it from the project source.

### Prerequisites

Install the following before setup:

- **Node.js** (LTS, v20 or newer recommended)
- **npm** (included with Node.js)
- **Git** (optional, if cloning from a repository)
- **Expo Go** on an Android phone, or Android Studio for a local emulator / native build
- A `.env` file in the project root with the API keys listed below

### 1. Open the Project Folder

If you received the project on a flash drive:

```bash
cd CitiSense
```

If you are cloning from a repository:

```bash
git clone <repository-url>
cd CitiSense
```

### 2. Install Dependencies

```bash
npm install
```

This creates the `node_modules` folder. It is required every time you set up the project on a new computer.

### 3. Configure Environment Variables

Create a `.env` file in the project root (same folder as `package.json`) with:

```env
EXPO_PUBLIC_MAPTILER_API_KEY=your_maptiler_api_key
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
EXPO_PUBLIC_DEEPGRAM_API_KEY=your_deepgram_api_key
EXPO_PUBLIC_ROBOFLOW_API_KEY=your_roboflow_api_key
```

What each key is for:

| Variable | Used for |
| --- | --- |
| `EXPO_PUBLIC_MAPTILER_API_KEY` | Maps, geotagging, and static map previews |
| `EXPO_PUBLIC_GEMINI_API_KEY` | AI complaint classification, prioritization, voice transcription, and resolution checks |
| `EXPO_PUBLIC_DEEPGRAM_API_KEY` | Optional speech-to-text fallback |
| `EXPO_PUBLIC_ROBOFLOW_API_KEY` | Privacy blurring on complaint photos |

If a `.env` file was already included with the submission, keep it and skip this step.

After changing `.env`, restart Metro with a cleared cache:

```bash
npx expo start -c
```

### 4. Start the Development Server

```bash
npm start
```

or

```bash
npx expo start
```

Then:

- Scan the QR code with **Expo Go** on Android, or
- Press `a` to open an Android emulator if Android Studio is installed

### 5. Run a Native Android Build (Optional)

Use this when you need a development build instead of Expo Go:

```bash
npx expo run:android
```

### 6. Sign In

Use the accounts in `CitiSense User Credentials.txt` (Admin, Department Head, and Citizen) on the login screen.

---

## 📖 Usage Details

### 👤 Citizen

Citizens can:

- Register and log in
- Submit complaints with descriptions and image evidence
- Use voice input during complaint submission
- Track complaint progress and status updates
- Validate resolved complaints
- Provide feedback and supporting photo evidence

### 🏢 Department Moderator

Department Moderators can:

- View assigned complaints
- Update complaint statuses
- Reassign complaints to appropriate departments
- Manage complaint resolution workflows
- Monitor department-specific concerns

### 👨‍💼 Admin

Administrators can:

- Monitor all complaints across departments
- Review citizen feedback and validation submissions
- Verify uploaded evidence
- Confirm complaint completion
- Access analytical dashboards and reports

---

## 🔄 Complaint Workflow

1. **Citizen submits a complaint**
2. **AI verifies and classifies the complaint**
3. **Complaint is assigned to the appropriate department**
4. **AI determines complaint priority**
5. **Department Moderator processes the complaint**
6. **Citizen validates the resolution**
7. **Admin reviews validation and confirms completion**

---

## 🛠️ Tech Stack

- **Frontend (Mobile):** React Native (Expo SDK 54)
- **Backend:** Supabase (PostgreSQL + Row-Level Security)
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage (complaint images and evidence)
- **AI/ML:** Google Gemini API (NLP-based complaint classification, prioritization, and duplicate detection), Roboflow (privacy blurring), Deepgram (speech-to-text)
- **Automation:** Supabase Edge Functions (Deno / TypeScript)
- **Maps & Geolocation:** MapTiler, Expo Location, Geotagging
- **Notifications:** Firebase Cloud Messaging (FCM)

---

## 👨‍💻 Proponents

- Joseph James Pinote
- Tricia Hyne Dungog
- Mary Jennyrose Bracero
- Zach Jimenez
