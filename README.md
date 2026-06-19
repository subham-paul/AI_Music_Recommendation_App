# 🎵 AI Music Recommendation App

An intelligent **AI-powered Music Recommendation Web Application** built with **Flask** that recommends songs based on user input and AI-driven analysis. The application provides a clean web interface and integrates external APIs to deliver personalized music recommendations.

---

## 🚀 Features

- 🎧 AI-based music recommendations
- 🌐 Flask-powered web application
- 🔗 REST API integration
- ⚡ Fast and lightweight backend
- 🌍 Cross-Origin Resource Sharing (CORS) support
- 🔐 Environment variable management using `.env`
- 🎼 Audio processing support (optional)
- 📷 Computer vision support (optional)
- 🔄 WebSocket support for real-time communication

---

## 🛠️ Tech Stack

### Backend
- Python 3.10+
- Flask

### Libraries Used

| Package | Version | Purpose |
|---------|---------|---------|
| Flask | 2.3.3 | Web Framework |
| flask-cors | 3.0.10 | Cross-Origin Resource Sharing |
| python-dotenv | 1.0.0 | Environment Variables |
| requests | 2.31.0 | API Requests |
| opencv-python *(Optional)* | 4.8.1.78 | Image Processing |
| pydub *(Optional)* | 0.25.1 | Audio Processing |
| websockets | 11.0.3 | Real-Time Communication |

---

# 📂 Project Structure

```
AI-Music-Recommendation-App/
│
├── app.py
├── requirements.txt
├── .env
├── static/
│   ├── css/
│   ├── js/
│   └── images/
│
├── templates/
│   ├── index.html
│   └── ...
│
├── utils/
│   └── ...
│
├── README.md
│
└── ...
```

---

# 📦 Installation

## 1. Clone the Repository

```bash
git clone https://github.com/subham-paul/AI-Music-Recommendation-App.git
```

```bash
cd AI-Music-Recommendation-App
```

---

## 2. Create Virtual Environment

### Windows

```bash
python -m venv venv
```

```bash
venv\Scripts\activate
```

### Linux / macOS

```bash
python3 -m venv venv
```

```bash
source venv/bin/activate
```

---

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## 4. Create Environment File

Create a file named:

```
.env
```

Example:

```env
API_KEY=your_api_key_here
SECRET_KEY=your_secret_key
```

---

## 5. Run the Application

```bash
python app.py
```

or

```bash
flask run
```

---

## 🌐 Open in Browser

```
http://127.0.0.1:5000
```

---

# 📋 Requirements

```
Flask==2.3.3
flask-cors==3.0.10
python-dotenv==1.0.0
requests==2.31.0
opencv-python==4.8.1.78
pydub==0.25.1
websockets==11.0.3
```

---

# 🎯 Future Improvements

- Spotify API Integration
- YouTube Music Support
- User Authentication
- Playlist Generation
- AI Emotion Detection
- Voice-Based Music Search
- Recommendation History
- Dark Mode
- Mobile Responsive UI
- Machine Learning Recommendation Model

---

# 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch

```bash
git checkout -b feature/NewFeature
```

3. Commit your changes

```bash
git commit -m "Add New Feature"
```

4. Push to GitHub

```bash
git push origin feature/NewFeature
```

5. Open a Pull Request

---

# 🐞 Issues

If you find any bugs or have feature requests, please open an issue in the GitHub repository.

---

# 📜 License

This project is licensed under the **MIT License**.

---

# 👨‍💻 Author

**Subham Paul**

- GitHub: https://github.com/subham-paul
- LinkedIn: https://www.linkedin.com/in/subham-paul-india/

---

# ⭐ Support

If you found this project useful:

⭐ Star this repository

🍴 Fork it

🛠️ Contribute to improve it

---

> *"Music is the soundtrack of life. AI makes discovering it even better."* 🎵
