// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ApiGateway from '../gateways/Api.gateway';
import { CartItem, OrderResult, PlaceOrderRequest } from '../protos/demo';
import { IProductCart } from '../types/Cart';
import { addBreadcrumb, setSpanAttributes, traceFlow } from '../utils/telemetry/Telemetry';
import { useCurrency } from './Currency.provider';

const ignoreLoggedFailure = () => undefined;

interface IContext {
  cart: IProductCart;
  addItem(item: CartItem): void;
  updateItemQuantity(productId: string, newQuantity: number): void;
  emptyCart(): void;
  placeOrder(order: PlaceOrderRequest): Promise<OrderResult>;
}

export const Context = createContext<IContext>({
  cart: { userId: '', items: [] },
  addItem: () => {},
  updateItemQuantity: () => {},
  emptyCart: () => {},
  placeOrder: () => Promise.resolve({} as OrderResult),
});

interface IProps {
  children: React.ReactNode;
}

export const useCart = () => useContext(Context);

const CartProvider = ({ children }: IProps) => {
  const { selectedCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const mutationOptions = useMemo(
    () => ({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['cart'] });
      },
    }),
    [queryClient]
  );

  const { data: cart = { userId: '', items: [] } } = useQuery({
    queryKey: ['cart', selectedCurrency],
    queryFn: () => ApiGateway.getCart(selectedCurrency),
  });
  const traceCartItemChange = (flowName: string, item: CartItem & { currencyCode: string }) =>
    traceFlow(
      flowName,
      {
        'demo.product.id': item.productId,
        'demo.product.quantity': item.quantity,
        'demo.user_context.selected_currency': item.currencyCode,
      },
      () => ApiGateway.addCartItem(item)
    );

  const addCartMutation = useMutation({
    mutationFn: (item: CartItem & { currencyCode: string }) => traceCartItemChange('add_to_cart', item),
    ...mutationOptions,
  });

  const updateCartItemMutation = useMutation({
    mutationFn: (item: CartItem & { currencyCode: string }) => traceCartItemChange('update_cart_item', item),
    ...mutationOptions,
  });

  const emptyCartMutation = useMutation({
    mutationFn: () => traceFlow('empty_cart', { 'demo.cart.items.count': cart.items.length }, () => ApiGateway.emptyCart()),
    ...mutationOptions,
  });

  const placeOrderMutation = useMutation({
    mutationFn: (order: PlaceOrderRequest & { currencyCode: string }) =>
      traceFlow(
        'place_order',
        {
          'demo.cart.items.count': cart.items.length,
          'demo.user_context.selected_currency': order.currencyCode,
        },
        async span => {
          const result = await ApiGateway.placeOrder(order);
          setSpanAttributes(span, {
            'demo.order.id': result.orderId,
            'demo.order.items.count': result.items.length,
          });
          return result;
        }
      ),
    ...mutationOptions,
  });

  const addItem = useCallback(
    (item: CartItem) => addCartMutation.mutateAsync({ ...item, currencyCode: selectedCurrency }),
    [addCartMutation, selectedCurrency]
  );

  const updateItemQuantity = useCallback(
    (productId: string, newQuantity: number) => {
      const existing = cart.items.find(i => i.productId === productId);
      const delta = newQuantity - (existing?.quantity ?? 0);
      if (delta !== 0) {
        addBreadcrumb(`Changed cart quantity of ${productId} from ${existing?.quantity ?? 0} to ${newQuantity}`);
        updateCartItemMutation
          .mutateAsync({ productId, quantity: delta, currencyCode: selectedCurrency })
          .catch(ignoreLoggedFailure);
      }
    },
    [updateCartItemMutation, cart.items, selectedCurrency]
  );
  const emptyCart = useCallback(() => emptyCartMutation.mutateAsync().catch(ignoreLoggedFailure), [emptyCartMutation]);
  const placeOrder = useCallback(
    (order: PlaceOrderRequest) => placeOrderMutation.mutateAsync({ ...order, currencyCode: selectedCurrency }),
    [placeOrderMutation, selectedCurrency]
  );

  const value = useMemo(() => ({ cart, addItem, updateItemQuantity, emptyCart, placeOrder }), [cart, addItem, updateItemQuantity, emptyCart, placeOrder]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export default CartProvider;
