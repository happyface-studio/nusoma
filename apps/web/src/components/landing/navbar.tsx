"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { baseUrl, getPathname, routes } from "@/lib/routes";
import { buttonVariants } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

import { MENU_LINKS } from "@/components/landing/marketing-links";
import { MobileMenu } from "@/components/landing/mobile-menu";
import { ExternalLink } from "./fragments/external-link";
import { Logo } from "../icons";
import { useAuth } from "@/providers/auth-provider";

export function Navbar(): React.JSX.Element {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <section className="sticky inset-x-0 top-0 z-40 border-b bg-background py-4">
      <div className="container">
        <nav className="hidden justify-between lg:flex">
          <div className="flex items-center gap-x-9">
            <Link href={routes.marketing.Index}>
              <Logo className="w-28" />
            </Link>
            <div className="flex items-center">
              <NavigationMenu>
                <NavigationMenuList>
                  {MENU_LINKS.map((item, index) =>
                    item.items ? (
                      <NavigationMenuItem key={index}>
                        <NavigationMenuTrigger
                          data-active={
                            item.items.some(
                              (subItem) =>
                                !subItem.external &&
                                subItem.href !== "#" &&
                                pathname.startsWith(
                                  getPathname(subItem.href, baseUrl),
                                ),
                            )
                              ? ""
                              : undefined
                          }
                          className="rounded-xl text-[15px] font-normal data-active:bg-accent"
                        >
                          {item.title}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent>
                          <ul className="w-96 list-none p-2">
                            {item.items.map((subItem, subIndex) => (
                              <li key={subIndex}>
                                <NavigationMenuLink
                                  render={
                                    <Link
                                      href={subItem.href}
                                      target={
                                        subItem.external ? "_blank" : undefined
                                      }
                                      rel={
                                        subItem.external
                                          ? "noopener noreferrer"
                                          : undefined
                                      }
                                    />
                                  }
                                  className="group flex select-none flex-row items-center gap-4 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                                >
                                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground transition-colors group-hover:text-foreground">
                                    {subItem.icon}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium">
                                      {subItem.title}
                                      {subItem.external && (
                                        <ExternalLink className="-mt-2 ml-1 size-2 inline text-muted-foreground" />
                                      )}
                                    </div>
                                    <p className="text-sm leading-snug text-muted-foreground">
                                      {subItem.description}
                                    </p>
                                  </div>
                                </NavigationMenuLink>
                              </li>
                            ))}
                          </ul>
                        </NavigationMenuContent>
                      </NavigationMenuItem>
                    ) : (
                      <NavigationMenuItem key={index}>
                        <NavigationMenuLink
                          active={
                            !item.external &&
                            pathname.startsWith(getPathname(item.href, baseUrl))
                          }
                          className={cn(
                            navigationMenuTriggerStyle(),
                            "rounded-xl text-[15px] font-normal data-active:bg-accent",
                          )}
                          render={
                            <Link
                              href={item.href}
                              target={item.external ? "_blank" : undefined}
                              rel={
                                item.external
                                  ? "noopener noreferrer"
                                  : undefined
                              }
                            />
                          }
                        >
                          {item.title}
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    ),
                  )}
                </NavigationMenuList>
              </NavigationMenu>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="rounded-xl border-none shadow-none" />
            {user ? (
              <Link
                href={routes.dashboard}
                className={cn(
                  buttonVariants({
                    variant: "outline",
                  }),
                  "rounded-xl",
                )}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href={routes.auth.SignIn}
                  className={cn(
                    buttonVariants({
                      variant: "outline",
                    }),
                    "rounded-xl",
                  )}
                >
                  Sign in
                </Link>
                <Link
                  href={routes.auth.SignUp}
                  className={cn(
                    buttonVariants({
                      variant: "default",
                    }),
                    "rounded-xl",
                  )}
                >
                  Start for free
                </Link>
              </>
            )}
          </div>
        </nav>
        <MobileMenu className="lg:hidden" user={user} />
      </div>
    </section>
  );
}
