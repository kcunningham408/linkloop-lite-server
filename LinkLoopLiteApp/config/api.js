// LinkLoop API Configuration
// In EAS / production builds the env var is baked in at build time.
// For local dev you can override below.

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||          // set in eas.json or CI
  'https://linkloop-9l3x.onrender.com/api';   // production default

// For local development, uncomment the line below and comment out the above:
// const API_URL = 'http://localhost:5000/api';

export default API_URL;
