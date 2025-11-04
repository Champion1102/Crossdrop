import './WaveAnimation.css';

const WaveAnimation = ({ isActive, children }) => {
  return (
    <div className="wave-container">
      {isActive && (
        <>
          <div className="wave wave-1"></div>
          <div className="wave wave-2"></div>
          <div className="wave wave-3"></div>
          <div className="wave wave-4"></div>
        </>
      )}
      <div className="wave-content">
        {children}
      </div>
    </div>
  );
};

export default WaveAnimation;

