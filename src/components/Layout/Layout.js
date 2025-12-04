import './Layout.scss'
import { Outlet } from 'react-router-dom';

/**
 * Layout container component that places the main content.
 * @component
 * @returns {JSX.Element}
 */
export const Layout = () => {
    return (
        <div className='layout'>
            <div className='main-content-container'>
                <Outlet />
            </div>
        </div>
    );
};