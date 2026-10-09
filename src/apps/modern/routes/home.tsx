import React, { useEffect, useRef } from 'react';
import Page from 'components/Page';
import { createHomeflix } from 'homeflix/app';
const Home = () => {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!root.current) return;
        const app = createHomeflix(root.current);
        void app.onResume();
        return () => app.destroy();
    }, []);
    return <Page id='indexPage' className='homePage libraryPage homeflix-page' isBackButtonEnabled={false}><div ref={root} /></Page>;
};
export default Home;
