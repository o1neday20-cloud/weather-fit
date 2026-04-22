import { createBrowserRouter } from "react-router";
import Home from "./pages/Home";
import Wardrobe from "./pages/Wardrobe";
import Outfit from "./pages/Outfit";
import Feedback from "./pages/Feedback";
import Settings from "./pages/Settings";
import Shop from "./pages/Shop";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Weather from "./pages/Weather";
import NotFound from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/wardrobe",
    Component: Wardrobe,
  },
  {
    path: "/outfit",
    Component: Outfit,
  },
  {
    path: "/feedback",
    Component: Feedback,
  },
  {
    path: "/weather",
    Component: Weather,
  },
  {
    path: "/settings",
    Component: Settings,
  },
  {
    path: "/shop",
    Component: Shop,
  },
  {
    path: "/product/:id",
    Component: ProductDetail,
  },
  {
    path: "/cart",
    Component: Cart,
  },
  {
    path: "/checkout",
    Component: Checkout,
  },
  {
    path: "*",
    Component: NotFound,
  },
]);