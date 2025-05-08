from flask import Flask, request, jsonify
from deepface import DeepFace
import os
import time

app = Flask(__name__)
UPLOAD_FOLDER = r'C:\Users\Rahul K\Downloads\Design_Code (1)\Design_Code\static\uploads'  # Point to Node.js upload directory
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/process', methods=['POST'])
def process_image():
    if 'file' not in request.files:
        return jsonify(success=False, error='No file uploaded')
    
    file = request.files['file']
    if file.filename == '':
        return jsonify(success=False, error='No selected file')

    try:
        # Save the file temporarily
        filename = f"temp_{int(time.time())}_{file.filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        # Face recognition
        matches = DeepFace.find(img_path=file_path, db_path=r'C:\Users\Rahul K\Downloads\Design_Code (1)\Design_Code\Dataset', silent=True)
        
        # Clean up temporary file
        os.remove(file_path)

        if matches and isinstance(matches, list) and not matches[0].empty:
            result = os.path.splitext(os.path.basename(matches[0]['identity'].iloc[0]))[0]
            return jsonify(success=True, result=result)
        return jsonify(success=True, result="Not in Dataset")

    except Exception as e:
        return jsonify(success=False, error=str(e))

if __name__ == '__main__':
    app.run(port=5000, debug=True)