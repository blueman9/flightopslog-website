import { Link } from 'react-router-dom'

const linkClasses = 'text-secondary-text hover:text-primary transition-colors'

function Footer() {
  return (
    <footer className="text-center text-secondary-text text-sm py-8 border-t border-secondary-text/20">
      <p>&copy; {new Date().getFullYear()} FlightOps Log. All rights reserved.</p>
      <div className="flex justify-center gap-4 mt-2">
        <Link to="/privacy" className={linkClasses}>
          Privacy Policy
        </Link>
        <Link to="/support" className={linkClasses}>
          Support
        </Link>
        <Link to="/import-template" className={linkClasses}>
          Import Template
        </Link>
        <Link to="/testflight" className={linkClasses}>
          Beta
        </Link>
      </div>
    </footer>
  )
}

export default Footer
