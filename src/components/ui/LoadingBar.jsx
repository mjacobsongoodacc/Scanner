export default function LoadingBar({ active }) {
  return <div className={`loading-bar${active ? " is-active" : ""}`} aria-hidden="true" />;
}
