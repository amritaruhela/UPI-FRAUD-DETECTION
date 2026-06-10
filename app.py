# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify
import pickle
# pyrefly: ignore [missing-import]
import numpy as np
import json
import os
import csv
import io
import random
from datetime import datetime, timedelta
import hashlib

app = Flask(__name__)

# ─── Model Loading ───────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model.pkl')

model = None
if os.path.exists(MODEL_PATH):
    with open(MODEL_PATH, 'rb') as f:
        model = pickle.load(f)

# Feature names matching the trained model
FEATURE_NAMES = [
    'amount', 'transaction_type', 'hour', 'day_of_week',
    'sender_balance_before', 'receiver_balance_before',
    'amount_to_balance_ratio', 'is_night_transaction',
    'is_weekend', 'transaction_count_last_hour'
]

FEATURE_LABELS = {
    'amount': 'Transaction Amount',
    'transaction_type': 'Transaction Type',
    'hour': 'Hour of Day',
    'day_of_week': 'Day of Week',
    'sender_balance_before': 'Sender Balance',
    'receiver_balance_before': 'Receiver Balance',
    'amount_to_balance_ratio': 'Amount/Balance Ratio',
    'is_night_transaction': 'Night Transaction',
    'is_weekend': 'Weekend',
    'transaction_count_last_hour': 'Txn Count (1hr)'
}

TRANSACTION_HISTORY = []


def rule_based_predict(features: dict) -> dict:
    """
    Deterministic rule-based fraud detector used when no .pkl model is present.
    Returns probability and a per-feature importance breakdown.
    """
    amount = float(features.get('amount', 0))
    hour = int(features.get('hour', 12))
    tx_type = int(features.get('transaction_type', 0))
    sender_bal = float(features.get('sender_balance_before', 1))
    ratio = float(features.get('amount_to_balance_ratio', 0))
    is_night = int(features.get('is_night_transaction', 0))
    is_weekend = int(features.get('is_weekend', 0))
    tx_count = int(features.get('transaction_count_last_hour', 1))

    score = 0.0
    importances = {}

    # --- Amount scoring ---
    if amount > 100000:
        a_score = min(0.40, 0.10 + (amount - 100000) / 500000)
    elif amount > 50000:
        a_score = 0.20
    elif amount < 10:
        a_score = 0.15
    else:
        a_score = 0.0
    importances['amount'] = round(a_score, 4)
    score += a_score

    # --- Amount/Balance ratio ---
    if ratio > 0.9:
        r_score = 0.25
    elif ratio > 0.7:
        r_score = 0.15
    else:
        r_score = 0.0
    importances['amount_to_balance_ratio'] = round(r_score, 4)
    score += r_score

    # --- Night transaction ---
    n_score = 0.15 if is_night else 0.0
    importances['is_night_transaction'] = round(n_score, 4)
    score += n_score

    # --- Transaction frequency ---
    if tx_count > 10:
        f_score = 0.20
    elif tx_count > 5:
        f_score = 0.10
    else:
        f_score = 0.0
    importances['transaction_count_last_hour'] = round(f_score, 4)
    score += f_score

    # --- Transaction type (3 = TRANSFER typically riskier) ---
    t_score = 0.10 if tx_type == 3 else 0.0
    importances['transaction_type'] = round(t_score, 4)
    score += t_score

    # Remaining features get near-zero importance for display
    for feat in FEATURE_NAMES:
        if feat not in importances:
            importances[feat] = round(random.uniform(0.001, 0.03), 4)

    fraud_prob = min(0.97, max(0.03, score))
    legit_prob = 1 - fraud_prob
    is_fraud = fraud_prob >= 0.5

    return {
        'fraud_probability': round(fraud_prob * 100, 1),
        'legit_probability': round(legit_prob * 100, 1),
        'is_fraud': is_fraud,
        'confidence': round(max(fraud_prob, legit_prob) * 100, 1),
        'risk_level': _risk_level(fraud_prob),
        'feature_importance': importances,
        'model_used': 'Rule-Based Engine'
    }


def _risk_level(prob: float) -> str:
    if prob >= 0.75:
        return 'CRITICAL'
    if prob >= 0.50:
        return 'HIGH'
    if prob >= 0.30:
        return 'MEDIUM'
    return 'LOW'


def run_model_predict(features: dict) -> dict:
    """Run the loaded pickle model and return the same shape as rule_based_predict."""
    feat_vec = np.array([[
        features.get('amount', 0),
        features.get('transaction_type', 0),
        features.get('hour', 12),
        features.get('day_of_week', 0),
        features.get('sender_balance_before', 0),
        features.get('receiver_balance_before', 0),
        features.get('amount_to_balance_ratio', 0),
        features.get('is_night_transaction', 0),
        features.get('is_weekend', 0),
        features.get('transaction_count_last_hour', 1),
    ]])

    proba = model.predict_proba(feat_vec)[0]
    fraud_prob = float(proba[1])
    legit_prob = float(proba[0])
    is_fraud = fraud_prob >= 0.5

    # Feature importance from tree model
    importances = {}
    if hasattr(model, 'feature_importances_'):
        fi = model.feature_importances_
        for i, name in enumerate(FEATURE_NAMES):
            importances[name] = round(float(fi[i]), 4)
    else:
        for name in FEATURE_NAMES:
            importances[name] = round(random.uniform(0.05, 0.15), 4)

    return {
        'fraud_probability': round(fraud_prob * 100, 1),
        'legit_probability': round(legit_prob * 100, 1),
        'is_fraud': is_fraud,
        'confidence': round(max(fraud_prob, legit_prob) * 100, 1),
        'risk_level': _risk_level(fraud_prob),
        'feature_importance': importances,
        'model_used': 'Random Forest Classifier'
    }


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route('/')
def home():
    return render_template('index.html')


@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No input data provided'}), 400

    try:
        amount = float(data.get('amount', 0))
        hour = int(data.get('hour', datetime.now().hour))
        tx_type_map = {'P2P': 0, 'P2M': 1, 'RECHARGE': 2, 'TRANSFER': 3}
        tx_type = tx_type_map.get(data.get('transaction_type', 'P2P'), 0)
        sender_bal = float(data.get('sender_balance', 10000))
        receiver_bal = float(data.get('receiver_balance', 5000))
        ratio = amount / max(sender_bal, 1)
        is_night = 1 if (hour >= 22 or hour <= 5) else 0
        dow = datetime.now().weekday()
        is_weekend = 1 if dow >= 5 else 0
        tx_count = int(data.get('transaction_count_last_hour', 1))

        features = {
            'amount': amount,
            'transaction_type': tx_type,
            'hour': hour,
            'day_of_week': dow,
            'sender_balance_before': sender_bal,
            'receiver_balance_before': receiver_bal,
            'amount_to_balance_ratio': ratio,
            'is_night_transaction': is_night,
            'is_weekend': is_weekend,
            'transaction_count_last_hour': tx_count
        }

        result = run_model_predict(features) if model else rule_based_predict(features)

        # Build feature importance with labels for frontend
        fi_labeled = [
            {
                'feature': FEATURE_LABELS.get(k, k),
                'key': k,
                'importance': v
            }
            for k, v in sorted(result['feature_importance'].items(),
                                key=lambda x: x[1], reverse=True)
        ]

        # Save to history
        tx_record = {
            'id': f"TXN{random.randint(100000, 999999)}",
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'amount': amount,
            'sender': data.get('sender_upi', 'unknown@upi'),
            'receiver': data.get('receiver_upi', 'unknown@upi'),
            'transaction_type': data.get('transaction_type', 'P2P'),
            'is_fraud': result['is_fraud'],
            'fraud_probability': result['fraud_probability'],
            'risk_level': result['risk_level']
        }
        TRANSACTION_HISTORY.insert(0, tx_record)
        if len(TRANSACTION_HISTORY) > 50:
            TRANSACTION_HISTORY.pop()

        return jsonify({
            **result,
            'feature_importance_labeled': fi_labeled,
            'transaction_id': tx_record['id'],
            'feature_labels': FEATURE_LABELS
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/history', methods=['GET'])
def history():
    return jsonify(TRANSACTION_HISTORY)


@app.route('/api/stats', methods=['GET'])
def stats():
    if not TRANSACTION_HISTORY:
        return jsonify({
            'total': 0, 'fraud_count': 0, 'legit_count': 0,
            'fraud_rate': 0, 'total_amount': 0, 'fraud_amount': 0
        })

    total = len(TRANSACTION_HISTORY)
    fraud_count = sum(1 for t in TRANSACTION_HISTORY if t['is_fraud'])
    total_amount = sum(t['amount'] for t in TRANSACTION_HISTORY)
    fraud_amount = sum(t['amount'] for t in TRANSACTION_HISTORY if t['is_fraud'])

    return jsonify({
        'total': total,
        'fraud_count': fraud_count,
        'legit_count': total - fraud_count,
        'fraud_rate': round(fraud_count / total * 100, 1),
        'total_amount': round(total_amount, 2),
        'fraud_amount': round(fraud_amount, 2)
    })


@app.route('/api/batch', methods=['POST'])
def batch_predict():
    """Upload CSV, get back predictions for each row."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    content = file.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(content))

    results = []
    for i, row in enumerate(reader):
        try:
            amount = float(row.get('amount', 0))
            tx_type_map = {'P2P': 0, 'P2M': 1, 'RECHARGE': 2, 'TRANSFER': 3}
            tx_type = tx_type_map.get(row.get('transaction_type', 'P2P'), 0)
            sender_bal = float(row.get('sender_balance', 10000))
            ratio = amount / max(sender_bal, 1)
            hour = int(row.get('hour', 12))
            is_night = 1 if (hour >= 22 or hour <= 5) else 0

            features = {
                'amount': amount,
                'transaction_type': tx_type,
                'hour': hour,
                'day_of_week': int(row.get('day_of_week', 0)),
                'sender_balance_before': sender_bal,
                'receiver_balance_before': float(row.get('receiver_balance', 5000)),
                'amount_to_balance_ratio': ratio,
                'is_night_transaction': is_night,
                'is_weekend': int(row.get('is_weekend', 0)),
                'transaction_count_last_hour': int(row.get('transaction_count', 1))
            }

            pred = run_model_predict(features) if model else rule_based_predict(features)
            results.append({
                'row': i + 1,
                'amount': amount,
                'is_fraud': pred['is_fraud'],
                'fraud_probability': pred['fraud_probability'],
                'risk_level': pred['risk_level']
            })
        except Exception as e:
            results.append({'row': i + 1, 'error': str(e)})

    fraud_in_batch = sum(1 for r in results if r.get('is_fraud'))
    return jsonify({
        'results': results,
        'summary': {
            'total': len(results),
            'fraud_detected': fraud_in_batch,
            'fraud_rate': round(fraud_in_batch / max(len(results), 1) * 100, 1)
        }
    })

USERS={}
@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    if username in USERS:
        return jsonify({'error': 'Username already exists'}), 409
    USERS[username] = hashlib.sha256(password.encode()).hexdigest()
    return jsonify({
    'success': True,
    'message': 'Account created',
    'username': username,
    'user': { 'username': username, 'id': 1 },
    'token': 'demo-token-' + username   # in case JS expects a token
}), 201
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    hashed = hashlib.sha256(password.encode()).hexdigest()
    if USERS.get(username) != hashed:
        return jsonify({'error': 'Invalid credentials'}), 401
    return jsonify({'message': 'Login successful', 'username': username}), 200

@app.route('/api/auth/me', methods=['GET'])
def me():
   return jsonify({
        'success': False,
        'logged_in': False,
        'username': None,
        'user': None
    }), 200
