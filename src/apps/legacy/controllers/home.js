import { createHomeflix } from 'homeflix/app';
export default function HomeView(view) {
    const app = createHomeflix(view.querySelector('.homeflix-root'));
    this.onResume = () => app.onResume();
    this.onPause = () => app.onPause();
    this.destroy = () => app.destroy();
}
