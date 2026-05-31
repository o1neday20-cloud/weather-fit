import { Outlet } from 'react-router';
import CampaignPopup from './CampaignPopup';

export default function Layout() {
  return (
    <>
      <Outlet />
      <CampaignPopup />
    </>
  );
}
