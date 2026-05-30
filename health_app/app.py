from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, date
import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///health.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


# Patient model
class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(100), nullable=False)
    date_of_birth = db.Column(db.Date, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    glucose = db.Column(db.Float, nullable=False)
    haemoglobin = db.Column(db.Float, nullable=False)
    cholesterol = db.Column(db.Float, nullable=False)
    remarks = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'full_name': self.full_name,
            'date_of_birth': self.date_of_birth.isoformat(),
            'email': self.email,
            'glucose': self.glucose,
            'haemoglobin': self.haemoglobin,
            'cholesterol': self.cholesterol,
            'remarks': self.remarks,
            'created_at': self.created_at.isoformat()
        }


# AI prediction function using Groq
def get_health_prediction(name, glucose, haemoglobin, cholesterol, age):
    try:
        api_key = os.getenv('GROQ_API_KEY')
        if not api_key or api_key == 'your_groq_api_key_here':
            return generate_fallback_prediction(glucose, haemoglobin, cholesterol)

        client = Groq(api_key=api_key)
        prompt = f"""You are a medical AI assistant. Based on the following blood test results, provide a brief health assessment and risk prediction.

Patient: {name}, Age: {age}
Blood Test Results:
- Glucose: {glucose} mg/dL (Normal: 70-100 mg/dL fasting)
- Haemoglobin: {haemoglobin} g/dL (Normal: Men 13.5-17.5, Women 12-15.5)
- Cholesterol: {cholesterol} mg/dL (Normal: <200 mg/dL)

Provide a concise health assessment (2-3 sentences) including:
1. Overall health status (Healthy/At Risk/Critical)
2. Any potential conditions suggested by these values
3. Brief recommendation

Keep it professional, concise, and clear. Start with the health status."""

        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            max_tokens=200
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        # Fallback rule-based prediction if API fails
        return generate_fallback_prediction(glucose, haemoglobin, cholesterol)


def generate_fallback_prediction(glucose, haemoglobin, cholesterol):
    issues = []
    status = "Healthy"

    if glucose > 126:
        issues.append("high glucose levels suggesting possible diabetes")
        status = "Critical"
    elif glucose > 100:
        issues.append("borderline glucose levels (pre-diabetic range)")
        status = "At Risk"

    if haemoglobin < 12:
        issues.append("low haemoglobin indicating possible anaemia")
        if status == "Healthy":
            status = "At Risk"

    if cholesterol > 240:
        issues.append("high cholesterol increasing cardiovascular risk")
        if status != "Critical":
            status = "At Risk"
    elif cholesterol > 200:
        issues.append("borderline high cholesterol")
        if status == "Healthy":
            status = "At Risk"

    if not issues:
        return "Status: Healthy \u2713 \u2014 All blood markers are within normal ranges. Continue maintaining a healthy lifestyle with regular exercise and balanced diet."
    else:
        return f"Status: {status} \u26a0 \u2014 Results indicate {', '.join(issues)}. Recommend consulting a healthcare professional for further evaluation and personalized treatment plan."


# Routes
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/patients', methods=['GET'])
def get_patients():
    patients = Patient.query.order_by(Patient.created_at.desc()).all()
    return jsonify([p.to_dict() for p in patients])


@app.route('/api/patients', methods=['POST'])
def create_patient():
    data = request.get_json()

    # Validation
    errors = validate_patient_data(data)
    if errors:
        return jsonify({'errors': errors}), 400

    # Check duplicate email
    if Patient.query.filter_by(email=data['email']).first():
        return jsonify({'errors': ['Email already exists']}), 400

    dob = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
    age = (date.today() - dob).days // 365

    patient = Patient(
        full_name=data['full_name'].strip(),
        date_of_birth=dob,
        email=data['email'].strip().lower(),
        glucose=float(data['glucose']),
        haemoglobin=float(data['haemoglobin']),
        cholesterol=float(data['cholesterol'])
    )

    # Get AI prediction
    patient.remarks = get_health_prediction(
        data['full_name'],
        float(data['glucose']),
        float(data['haemoglobin']),
        float(data['cholesterol']),
        age
    )

    db.session.add(patient)
    db.session.commit()
    return jsonify(patient.to_dict()), 201


@app.route('/api/patients/<int:id>', methods=['GET'])
def get_patient(id):
    patient = Patient.query.get_or_404(id)
    return jsonify(patient.to_dict())


@app.route('/api/patients/<int:id>', methods=['PUT'])
def update_patient(id):
    patient = Patient.query.get_or_404(id)
    data = request.get_json()

    errors = validate_patient_data(data, patient_id=id)
    if errors:
        return jsonify({'errors': errors}), 400

    # Check duplicate email (excluding current patient)
    existing = Patient.query.filter_by(email=data['email'].strip().lower()).first()
    if existing and existing.id != id:
        return jsonify({'errors': ['Email already exists']}), 400

    dob = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
    age = (date.today() - dob).days // 365

    patient.full_name = data['full_name'].strip()
    patient.date_of_birth = dob
    patient.email = data['email'].strip().lower()
    patient.glucose = float(data['glucose'])
    patient.haemoglobin = float(data['haemoglobin'])
    patient.cholesterol = float(data['cholesterol'])
    patient.updated_at = datetime.utcnow()

    # Regenerate AI prediction
    patient.remarks = get_health_prediction(
        data['full_name'],
        float(data['glucose']),
        float(data['haemoglobin']),
        float(data['cholesterol']),
        age
    )

    db.session.commit()
    return jsonify(patient.to_dict())


@app.route('/api/patients/<int:id>', methods=['DELETE'])
def delete_patient(id):
    patient = Patient.query.get_or_404(id)
    db.session.delete(patient)
    db.session.commit()
    return jsonify({'message': 'Patient deleted successfully'})


@app.route('/api/stats', methods=['GET'])
def get_stats():
    patients = Patient.query.all()
    if not patients:
        return jsonify({'total': 0, 'avg_glucose': 0, 'avg_haemoglobin': 0, 'avg_cholesterol': 0})

    total = len(patients)
    avg_glucose = sum(p.glucose for p in patients) / total
    avg_haemoglobin = sum(p.haemoglobin for p in patients) / total
    avg_cholesterol = sum(p.cholesterol for p in patients) / total

    return jsonify({
        'total': total,
        'avg_glucose': round(avg_glucose, 1),
        'avg_haemoglobin': round(avg_haemoglobin, 1),
        'avg_cholesterol': round(avg_cholesterol, 1)
    })


def validate_patient_data(data, patient_id=None):
    errors = []
    import re

    if not data.get('full_name') or len(data['full_name'].strip()) < 2:
        errors.append('Full name must be at least 2 characters')

    if not data.get('email') or not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', data['email']):
        errors.append('Invalid email address format')

    if not data.get('date_of_birth'):
        errors.append('Date of birth is required')
    else:
        try:
            dob = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
            if dob >= date.today():
                errors.append('Date of birth cannot be today or a future date')
        except ValueError:
            errors.append('Invalid date format')

    for field in ['glucose', 'haemoglobin', 'cholesterol']:
        val = data.get(field)
        if val is None or val == '':
            errors.append(f'{field.capitalize()} is required')
        else:
            try:
                fval = float(val)
                if fval <= 0:
                    errors.append(f'{field.capitalize()} must be a positive number')
            except (ValueError, TypeError):
                errors.append(f'{field.capitalize()} must be a numeric value')

    return errors


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)
