import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxqXSqKX-zwHFwhtdk2iD8sJZJuxgPAMU",
  authDomain: "aaaa-8a896.firebaseapp.com",
  projectId: "aaaa-8a896",
  storageBucket: "aaaa-8a896.firebasestorage.app",
  messagingSenderId: "857547756701",
  appId: "1:857547756701:web:a735f03b50bc660126b074"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
