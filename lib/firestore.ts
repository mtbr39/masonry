import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { Category, Photo } from "./types";

export async function getCategories(): Promise<Category[]> {
  const snap = await getDocs(collection(db, "categories"));
  return snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }));
}

export async function addCategory(name: string): Promise<string> {
  const ref = await addDoc(collection(db, "categories"), { name });
  return ref.id;
}

export async function getPhotos(categoryId?: string): Promise<Photo[]> {
  const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const photos = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      url: data.url as string,
      categoryId: data.categoryId as string,
      createdAt: (data.createdAt as Timestamp).toDate(),
      width: data.width as number,
      height: data.height as number,
    };
  });
  if (categoryId) return photos.filter((p) => p.categoryId === categoryId);
  return photos;
}

export async function addPhoto(photo: Omit<Photo, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "photos"), {
    ...photo,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
