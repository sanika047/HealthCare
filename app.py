from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, date
import os
import re
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ── Database ──────────────────────────────────────────────────────────────────
database_url = os.getenv('DATABASE_URL', '')

if not database_url:
    # On Render the app directory is read-only; /tmp is always writable.
    # Locally we use the instance/ folder next to app.py.
    if os.getenv('RENDER'):
        db_path = '/tmp/health.db'
    else:
        basedir = os.path.abspath(os.path.dirname(__file__))
        db_dir  = os.path.join(basedir, 'instance')
        os.makedirs(db_dir, exist_ok=True)
        db_path = os.path.join(db_dir, 'health.db')
    database_url = 'sqlite:///' + db_path

# Render free tier still returns the legacy postgres:// scheme
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


# ── Models ────────────────────────────────────────────────────────────────────
class Patient(db.Model):
    id           = db.Column(db.Integer, primary_key=True)
    full_name    = db.Column(db.String(100), nullable=False)
    date_of_birth= db.Column(db.Date, nullable=False)
    email        = db.Column(db.String(120), unique=True, nullable=False)
    glucose      = db.Column(db.Float, nullable=False)
    haemoglobin  = db.Column(db.Float, nullable=False)
    cholesterol  = db.Column(db.Float, nullable=False)
    remarks      = db.Column(db.Text, default='')
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at   = db.Column(db.DateTime, default=datetime.utcnow,
                             onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id':            self.id,
            'full_name':     self.full_name,
            'date_of_birth': self.date_of_birth.isoformat(),
            'email':         self.email,
            'glucose':       self.glucose,
            'haemoglobin':   self.haemoglobin,
            'cholesterol':   self.cholesterol,
            'remarks':       self.remarks,
            'created_at':    self.created_at.isoformat(),
        }


# ── AI prediction ─────────────────────────────────────────────────────────────
def get_health_prediction(name, glucose, haemoglobin, cholesterol, age):
    api_key = os.getenv('GROQ_API_KEY', '').strip()
    if api_key and api_key != 'your_groq_api_key_here':
        try:
            from groq import Groq
            client = Groq(api_key=api_key)
            prompt = (
                f"You are a medical AI assistant. Based on the following blood test results, "
                f"provide a brief health assessment and risk prediction.\n\n"
                f"Patient: {name}, Age: {age}\n"
                f"Blood Test Results:\n"
                f"- Glucose: {glucose} mg/dL  (Normal fasting: 70-100 mg/dL)\n"
                f"- Haemoglobin: {haemoglobin} g/dL  (Normal: Men 13.5-17.5, Women 12-15.5)\n"
                f"- Cholesterol: {cholesterol} mg/dL  (Normal: <200 mg/dL)\n\n"
                f"Provide a concise health assessment (2-3 sentences) including:\n"
                f"1. Overall health status (Healthy / At Risk / Critical)\n"
                f"2. Any potential conditions suggested by these values\n"
                f"3. A brief recommendation\n\n"
                f"Keep it professional and concise. Begin with the health status label."
            )
            chat_completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama3-8b-8192",
                max_tokens=220,
            )
            return chat_completion.choices[0].message.content.strip()
        except Exception as exc:
            print(f"[Groq] API error: {exc}")

    return _fallback_prediction(glucose, haemoglobin, cholesterol)


def _fallback_prediction(glucose, haemoglobin, cholesterol):
    issues, status = [], "Healthy"

    if glucose > 126:
        issues.append("high glucose levels suggesting possible diabetes")
        status = "Critical"
    elif glucose > 100:
        issues.append("borderline glucose levels (pre-diabetic range)")
        status = "At Risk"

    if haemoglobin < 8:
        issues.append("severely low haemoglobin indicating serious anaemia")
        status = "Critical"
    elif haemoglobin < 12:
        issues.append("low haemoglobin indicating possible anaemia")
        if status == "Healthy":
            status = "At Risk"

    if cholesterol > 240:
        issues.append("high cholesterol increasing cardiovascular risk")
        if status == "Healthy":
            status = "At Risk"
    elif cholesterol > 200:
        issues.append("borderline high cholesterol")
        if status == "Healthy":
            status = "At Risk"

    if not issues:
        return (
            "Status: Healthy \u2713 \u2014 All blood markers are within normal ranges. "
            "Continue maintaining a healthy lifestyle with regular exercise and a balanced diet. "
            "Schedule routine check-ups annually."
        )
    return (
        f"Status: {status} \u26a0 \u2014 Results indicate {', '.join(issues)}. "
        "Recommend consulting a healthcare professional for further evaluation "
        "and a personalised treatment plan."
    )


# ── Validation ────────────────────────────────────────────────────────────────
def validate_patient_data(data):
    errors = []

    if not data.get('full_name') or len(str(data['full_name']).strip()) < 2:
        errors.append('Full name must be at least 2 characters.')

    if not data.get('email') or not re.match(
            r'^[^\s@]+@[^\s@]+\.[^\s@]+$', str(data['email'])):
        errors.append('Invalid email address format.')

    if not data.get('date_of_birth'):
        errors.append('Date of birth is required.')
    else:
        try:
            dob = datetime.strptime(str(data['date_of_birth']), '%Y-%m-%d').date()
            if dob >= date.today():
                errors.append('Date of birth cannot be today or a future date.')
        except ValueError:
            errors.append('Invalid date format. Use YYYY-MM-DD.')

    for field in ['glucose', 'haemoglobin', 'cholesterol']:
        val = data.get(field)
        if val is None or str(val).strip() == '':
            errors.append(f'{field.capitalize()} is required.')
        else:
            try:
                if float(val) <= 0:
                    errors.append(f'{field.capitalize()} must be a positive number.')
            except (ValueError, TypeError):
                errors.append(f'{field.capitalize()} must be a numeric value.')

    return errors


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/patients', methods=['GET'])
def get_patients():
    patients = Patient.query.order_by(Patient.created_at.desc()).all()
    return jsonify([p.to_dict() for p in patients])


@app.route('/api/patients', methods=['POST'])
def create_patient():
    data = request.get_json(silent=True) or {}
    errors = validate_patient_data(data)
    if errors:
        return jsonify({'errors': errors}), 400

    if Patient.query.filter_by(email=data['email'].strip().lower()).first():
        return jsonify({'errors': ['A patient with this email already exists.']}), 400

    dob = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
    age = (date.today() - dob).days // 365

    patient = Patient(
        full_name    = data['full_name'].strip(),
        date_of_birth= dob,
        email        = data['email'].strip().lower(),
        glucose      = float(data['glucose']),
        haemoglobin  = float(data['haemoglobin']),
        cholesterol  = float(data['cholesterol']),
    )
    patient.remarks = get_health_prediction(
        patient.full_name, patient.glucose,
        patient.haemoglobin, patient.cholesterol, age
    )
    db.session.add(patient)
    db.session.commit()
    return jsonify(patient.to_dict()), 201


@app.route('/api/patients/<int:patient_id>', methods=['GET'])
def get_patient(patient_id):
    return jsonify(Patient.query.get_or_404(patient_id).to_dict())


@app.route('/api/patients/<int:patient_id>', methods=['PUT'])
def update_patient(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    data = request.get_json(silent=True) or {}

    errors = validate_patient_data(data)
    if errors:
        return jsonify({'errors': errors}), 400

    existing = Patient.query.filter_by(
        email=data['email'].strip().lower()).first()
    if existing and existing.id != patient_id:
        return jsonify({'errors': ['A patient with this email already exists.']}), 400

    dob = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
    age = (date.today() - dob).days // 365

    patient.full_name     = data['full_name'].strip()
    patient.date_of_birth = dob
    patient.email         = data['email'].strip().lower()
    patient.glucose       = float(data['glucose'])
    patient.haemoglobin   = float(data['haemoglobin'])
    patient.cholesterol   = float(data['cholesterol'])
    patient.updated_at    = datetime.utcnow()
    patient.remarks       = get_health_prediction(
        patient.full_name, patient.glucose,
        patient.haemoglobin, patient.cholesterol, age
    )
    db.session.commit()
    return jsonify(patient.to_dict())


@app.route('/api/patients/<int:patient_id>', methods=['DELETE'])
def delete_patient(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    db.session.delete(patient)
    db.session.commit()
    return jsonify({'message': 'Patient record deleted successfully.'})


@app.route('/api/stats', methods=['GET'])
def get_stats():
    patients = Patient.query.all()
    if not patients:
        return jsonify({'total': 0, 'avg_glucose': 0,
                        'avg_haemoglobin': 0, 'avg_cholesterol': 0})
    total = len(patients)
    return jsonify({
        'total':           total,
        'avg_glucose':     round(sum(p.glucose      for p in patients) / total, 1),
        'avg_haemoglobin': round(sum(p.haemoglobin  for p in patients) / total, 1),
        'avg_cholesterol': round(sum(p.cholesterol  for p in patients) / total, 1),
    })


# ── Startup ───────────────────────────────────────────────────────────────────
# This runs whether the app is started via `python app.py` or `gunicorn app:app`
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'development') != 'production'
    app.run(debug=debug, host='0.0.0.0', port=port)
