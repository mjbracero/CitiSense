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

### Prerequisites

Before running the project, ensure the following are installed:

- **Node.js** (Latest LTS Version)
- **npm** or **Yarn**
- **Git**
- **Expo CLI**
- **Supabase Project Configuration**

### Installation

#### 1. Clone the Repository

```bash
git clone <repository-url>
cd CitiSense
```

#### 2. Install Dependencies

```bash
npm install
```

or

```bash
yarn install
```

#### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### 4. Start the Development Server

```bash
npx expo start
```

#### 5. Run the Application

**Android**

```bash
npx expo run:android
```

**iOS**

```bash
npx expo run:ios
```

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

- **Frontend (Mobile):** React Native (Expo)
- **Backend:** Supabase (PostgreSQL + Row-Level Security)
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage (complaint images and evidence)
- **AI/ML:** NLP-based complaint classification, prioritization, and duplicate detection
- **Automation:** n8n AI Agent
- **Maps & Geolocation:** MapTiler, Expo Location, Geotagging
- **Notifications:** Firebase Cloud Messaging (FCM)

---

## 👨‍💻 Proponents

- Joseph James Pinote
- Tricia Hyne Dungog
- Mary Jennyrose Bracero
- Zach Jimenez

---

## 📄 License

This project was developed as an academic capstone and research project. All rights are reserved by the project proponents and their institution.
