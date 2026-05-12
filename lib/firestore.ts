import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Category, Photo, CanvasItem } from "./types";

export async function getCategories(): Promise<Category[]> {
  const snap = await getDocs(collection(db, "categories"));
  const cats = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name as string,
      order: typeof data.order === "number" ? (data.order as number) : Number.MAX_SAFE_INTEGER,
      audioUrl: typeof data.audioUrl === "string" ? (data.audioUrl as string) : undefined,
    };
  });
  cats.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return cats;
}

export async function addCategory(name: string, order: number): Promise<string> {
  const ref = await addDoc(collection(db, "categories"), { name, order });
  return ref.id;
}

export async function updateCategory(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, "categories", id), { name });
}

export async function updateCategoryAudio(id: string, audioUrl: string | null): Promise<void> {
  await updateDoc(doc(db, "categories", id), { audioUrl: audioUrl ?? null });
}

export async function updateCategoryOrders(items: { id: string; order: number }[]): Promise<void> {
  const batch = writeBatch(db);
  for (const it of items) {
    batch.update(doc(db, "categories", it.id), { order: it.order });
  }
  await batch.commit();
}

export async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(doc(db, "categories", id));
  // 対応するキャンバスレイアウトも削除
  await deleteDoc(doc(db, "canvas", id)).catch(() => {});
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

export async function deletePhoto(id: string): Promise<void> {
  await deleteDoc(doc(db, "photos", id));
}

export async function getCanvasLayout(categoryId = "default"): Promise<CanvasItem[]> {
  const snap = await getDoc(doc(db, "canvas", categoryId));
  if (!snap.exists()) return [];
  return (snap.data().items ?? []) as CanvasItem[];
}

export async function saveCanvasLayout(items: CanvasItem[], categoryId = "default"): Promise<void> {
  await setDoc(doc(db, "canvas", categoryId), { items });
}
