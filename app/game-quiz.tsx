import { Redirect } from 'expo-router';
// Preserve old bookmarks while retiring the intersection quiz.
export default function FormerQuizScreen() { return <Redirect href="/game" />; }
