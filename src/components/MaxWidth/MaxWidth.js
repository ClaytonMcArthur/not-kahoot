import './MaxWidth.scss';

/**
 * MaxWidth container component that limits the maximum width of its children to 1440px. 
 * This ensures all content is displayed in the center of the screen no matter the screen size.
 * @component
 * @returns {JSX.Element}
 */
export const MaxWidth = (props) => {
    return (
        <div className='max-width'>{props.children}</div>
    );
}